const formatLead = require('../utils/formatLead');
const crmService = require('../services/crmService');

exports.verifyWebhook = (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    console.log('Webhook verificado');
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
};

exports.receiveLead = async (req, res) => {
  try {
    console.log('Webhook recebido:', JSON.stringify(req.body));

    const leadFormatado = formatLead(req.body);

    await crmService.sendLead(leadFormatado);

    res.sendStatus(200);
  } catch (error) {
    console.error('Erro ao processar lead:', error);
    res.sendStatus(500);
  }
};
