const axios = require('axios');

exports.sendLead = async (lead) => {
  try {
    const response = await axios.post(
      process.env.CRM_API_URL,
      lead,
      {
        headers: {
          Authorization: `Bearer ${process.env.CRM_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Lead enviado para CRM:', response.data);
  } catch (error) {
    console.error('Erro ao enviar para CRM:', error.response?.data || error.message);
  }
};
