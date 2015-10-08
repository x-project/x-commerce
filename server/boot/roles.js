var async = require('async');
var if_async = require('if-async');

var ROLES = ['owner', 'admin', 'operator'];

var DEFAULT_ADMIN = {
  fullname: 'Main Admin',
  isMainAdmin: true,
  role: 'admin',
  password: '123',
  email: 'admin@x-commerce.com'
};

var model = 'Manager';

module.exports = function (server, done) {

  var Role = server.models.Role;
  var RoleMapping = server.models.RoleMapping;
  var InvitableUser = server.models[model];

  var create_role = function (name, next) {
    // add role only if it not exists
    Role.findOne({where: {name: name}}, function (err, role) {
      if (err || role) {
        setImmediate(next, err);
        return;
      }

      Role.create({ name: name }, next);
    });
  };

  var have_admin = function (cb) {
    InvitableUser.findOne({where: {isMainAdmin: true}}, function (err, user) {
      return cb(null, !!user);
    });
  };

  var retrieve_role = function (x_data, done) {
    Role.findOne({name: 'admin'}, function (err, role) {
      x_data.role = role;
      setImmediate(done, err, x_data);
    });
  };

  var create_admin = function (x_data, done) {
    var user = DEFAULT_ADMIN;

    InvitableUser.create(user, function (err, user) {
      x_data.user = user;
      setImmediate(done, err, x_data);
    });
  };

  var assign_role = function (x_data, done) {
    x_data.role.principals.create({
      principalType: RoleMapping.USER,
      principalId: x_data.user.id
    }, function (err) {
      setImmediate(done, err, x_data);
    });
  };

  var generate_admin = function (done) {
    var x_data = {};

    async.waterfall([
      function (next) { setImmediate(next, null, x_data); },
      retrieve_role,
      create_admin,
      assign_role
    ], done);
  };

  // create roles
  async.waterfall([
    function (next) { async.eachSeries(ROLES, create_role, next); },
    if_async.not(have_admin).then(generate_admin)
  ], done);

};
