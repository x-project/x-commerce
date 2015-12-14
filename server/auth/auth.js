module.exports = function (app) {

  require('./auth-google')(app);
  require('./auth-facebook')(app);

};