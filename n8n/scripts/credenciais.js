// Ids das credenciais usadas pelos workflows gerados, num lugar só (não são segredo: o
// segredo fica guardado no n8n). Antes de configurar fica o marcador CONFIGURAR_*;
// depois, troque pelo id real, rode npm run build e commite: o deploy grava o JSON do
// repositório e voltaria o marcador.
// - GROQ: a credencial "WhatsPCPGroq" (groqApi), usada pelo intérprete dos e-mails (F5c)
//   e pelo Assistente na API (F5d).
const ID_CREDENCIAL_GROQ = 'njh1FO6l7bYhWhIL';
// - GMAIL: a credencial "Gmail PCP (só leitura)", OAuth2 genérica (oAuth2Api) com o escopo
//   https://www.googleapis.com/auth/gmail.readonly, usada pelo Ler E-mails do PCP (F5c).
const ID_CREDENCIAL_GMAIL = '29o0KlF6g0TvoUFV';

function idCredencialValido(id) {
  if (typeof id !== 'string') return false;
  if (/^CONFIGURAR_[A-Z0-9_]+$/.test(id)) return true;
  return /^[A-Za-z0-9_-]{4,64}$/.test(id) && id.indexOf('CONFIGURAR_') !== 0;
}

module.exports = { ID_CREDENCIAL_GROQ, ID_CREDENCIAL_GMAIL, idCredencialValido };
