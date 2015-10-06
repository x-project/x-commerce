var async = require('async');
var if_async = require('if-async');

var ROLES = ['admin', 'editor', 'author'];

var DEFAULT_ADMIN = {
  fullname: 'Main Admin',
  isMainAdmin: true,
  role: 'admin',
  password: '123',
  email: 'admin@x-journal.com'
};

module.exports = function (server, done) {

  var Role = server.models.Role;
  var RoleMapping = server.models.RoleMapping;
  var Member = server.models.Member;

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
    Member.findOne({where: {isMainAdmin: true}}, function (err, member) {
      return cb(null, !!member);
    });
  };

  var retrieve_role = function (x_data, done) {
    Role.findOne({name: 'admin'}, function (err, role) {
      x_data.role = role;
      setImmediate(done, err, x_data);
    });
  };

  var create_admin = function (x_data, done) {
    var member = DEFAULT_ADMIN;

    Member.create(member, function (err, member) {
      x_data.member = member;
      setImmediate(done, err, x_data);
    });
  };

  var assign_role = function (x_data, done) {
    x_data.role.principals.create({
      principalType: RoleMapping.USER,
      principalId: x_data.member.id
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
    function (next) { async.eachSeries(create_role, next); },
    if_async.not(have_admin).then(generate_admin)
  ], done);

};
