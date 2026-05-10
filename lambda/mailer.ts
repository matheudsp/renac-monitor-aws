import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import type { ReportItem } from './types';

const sesClient = new SESClient({ region: 'sa-east-1' });

export async function sendEmail(data: ReportItem[]): Promise<void> {
    const sender = process.env.SENDER_EMAIL;
    const recipients =
        process.env.RECIPIENTS_EMAILS?.split(',')
            .map((e) => e.trim())
            .filter(Boolean) || [];

    const offlineCount = data.filter((i) => i.statusText.includes('Offline')).length;

    let subject = '';
    const dateStr = new Date().toLocaleDateString('pt-BR');

    if (offlineCount > 0) {
        subject = `⚠️ ALERTA: ${offlineCount} Usina(s) Offline - Relatório ${dateStr}`;
    } else {
        subject = `✅ Os sistemas estão saudáveis - Relatório Solar (${dateStr})`;
    }

    const tableRows = data
        .map((item) => {
            const isError = item.statusText.includes('Offline');
            // Se for erro, fundo vermelho claro (#ffe6e6), senão branco
            const bgStyle = isError ? 'background-color: #ffe6e6;' : '';
            const statusStyle = isError ? 'color: #d9534f; font-weight: bold;' : 'color: #28a745;';

            return `
            <tr style="${bgStyle}">
                <td style="padding: 12px; border-bottom: 1px solid #ddd;">
                    <strong style="color: #333;">${item.name}</strong>
                    <br/><span style="font-size: 11px; color:#777">ID: ${item.id}</span>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center;">
                    <strong>${item.day_energy} kWh</strong>
                    </td>
                 <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: center; color: #666;">
                    ${item.expected_energy.toFixed(2)} kWh
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #ddd; ${statusStyle}">
                    ${item.statusText}
                </td>
            </tr>
            `;
        })
        .join('');

    const htmlBody = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f4f4f4; padding: 20px;">
            
            <div style="background-color: #2c3e50; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                <h2 style="color: #ffffff; margin: 0; font-size: 20px;">Monitoramento Solar</h2>
            </div>

            <div style="background-color: #ffffff; padding: 20px; border: 1px solid #ddd; border-top: none;">
                <p style="color: #555; font-size: 14px;">
                    Resumo da geração das usinas em: <strong>${new Date().toLocaleString('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                    })}</strong>
                </p>
                
                <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px;">
                    <thead>
                        <tr style="background-color: #ecf0f1; text-align: left; color: #555;">
                            <th style="padding: 10px; border-bottom: 2px solid #ddd;">Usina</th>
                            <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: center;">Geração Diária</th>
                            <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: center;">Geração Esperada</th>
                            <th style="padding: 10px; border-bottom: 2px solid #ddd;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>

            <div style="text-align: center; padding-top: 20px; color: #888; font-size: 11px;">
                <p>Desenvolvido por <strong>Matheus de S. Pereira</strong></p>
                <p>Enviado automaticamente via AWS Lambda.</p>
            </div>
        </div>
    `;

    const command = new SendEmailCommand({
        Source: sender,
        Destination: { ToAddresses: recipients },
        Message: {
            Subject: { Data: subject },
            Body: {
                Html: { Data: htmlBody },
                Text: { Data: JSON.stringify(data, null, 2) },
            },
        },
    });

    try {
        await sesClient.send(command);
        console.log(`E-mail enviado com sucesso. Assunto: "${subject}" | Para: ${recipients.join(', ')}`);
    } catch (error) {
        console.error('Falha ao enviar e-mail SES:', error);
        throw error;
    }
}
