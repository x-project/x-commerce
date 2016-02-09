module.exports = function (MailMessage) {

  //used in customer.js ad invite.js
  MailMessage.get_mail_configuration_params = function (filter) {
    return new Promise(function (resolve, reject) {
      MailMessage.find(filter, function (err, models) {
        if (err) {
          reject(err);
          return;
        }
        resolve(models);
      });
    });
  }
};