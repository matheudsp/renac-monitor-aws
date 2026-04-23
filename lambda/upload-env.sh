#!/bin/bash

if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
else
  echo "Erro: Arquivo .env não encontrado na pasta atual."
  exit 1
fi

echo "Iniciando upload para o AWS SSM Parameter Store..."


aws ssm put-parameter \
    --name "/renac/prod/user" \
    --value "$RENAC_USER" \
    --type "String" \
    --overwrite

aws ssm put-parameter \
    --name "/renac/prod/user2" \
    --value "$RENAC_USER2" \
    --type "String" \
    --overwrite

aws ssm put-parameter \
    --name "/renac/prod/phb_user" \
    --value "$PHB_USER" \
    --type "String" \
    --overwrite

aws ssm put-parameter \
    --name "/renac/prod/phb_password" \
    --value "$PHB_PASS" \
    --type "String" \
    --overwrite


aws ssm put-parameter \
    --name "/renac/prod/password" \
    --value "$RENAC_PASS" \
    --type "String" \
    --overwrite

aws ssm put-parameter \
    --name "/renac/prod/password" \
    --value "$RENAC_PASS" \
    --type "String" \
    --overwrite

    aws ssm put-parameter \
    --name "/renac/prod/password2" \
    --value "$RENAC_PASS2" \
    --type "String" \
    --overwrite

aws ssm put-parameter \
    --name "/renac/prod/sender_email" \
    --value "$SENDER_EMAIL" \
    --type "String" \
    --overwrite

aws ssm put-parameter \
    --name "/renac/prod/recipients_emails" \
    --value "$RECIPIENTS_EMAILS" \
    --type "String" \
    --overwrite

aws ssm put-parameter --name /renac/prod/solarman_user     --value "$SOLARMAN_USER"   --type "String" --overwrite
aws ssm put-parameter --name /renac/prod/solarman_password --value "$SOLARMAN_PASSWORD"   --type "String" --overwrite
aws ssm put-parameter --name /renac/prod/two_captcha_api_key --value "$TWO_CAPTCHA_API_KEY" --type "String" --overwrite

echo "✅ Sucesso! Credenciais enviadas para a nuvem."