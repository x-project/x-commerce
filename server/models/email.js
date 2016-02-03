module.exports = function (server) {

  var email_connector = server.dataSources.Email.connector;
  var email_options = email_connector.transportForName('smtp').transporter.options;
  email_options.auth = {
    user: 'baljinderjit@yahoo.com',
    pass: ''
  };
};