module.exports = function formatLead(data) {
  // Adapte conforme o payload real da Meta
  return {
    nome: data?.name || '',
    email: data?.email || '',
    telefone: data?.phone || '',
    origem: 'Meta Ads'
  };
};
