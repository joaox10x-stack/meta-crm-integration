const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Verificação do webhook (Meta exige isso)
router.get('/', webhookController.verifyWebhook);

// Recebimento dos leads
router.post('/', webhookController.receiveLead);

module.exports = router;
