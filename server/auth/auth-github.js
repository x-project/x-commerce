
// GITHUB
app.post('/auth/github',
  // Step 1. Exchange authorization code for access token.
  function(req, res, next) {
    var accessTokenUrl = 'https://github.com/login/oauth/access_token';
    var params = {
      code: req.body.code,
      client_id: req.body.clientId,
      client_secret: config.GITHUB_SECRET,
      redirect_uri: req.body.redirectUri
    };

    request.get({ url: accessTokenUrl, qs: params }, function(err, response, accessToken) {
      if (err) {
        res.status(500).send(err);
        return;
      }
      req.accessToken = qs.parse(accessToken);
      next();
    });
  },

  // Step 2. Retrieve profile information about the current user.
  function (req, res, next) {
    var accessToken = req.accessToken;
    var headers = { 'User-Agent': 'Satellizer' };
    var userApiUrl = 'https://api.github.com/user';

    request.get({ url: userApiUrl, qs: accessToken, headers: headers, json: true }, function(err, response, profile) {
      if (err) {
        res.status(500).send(err);
        return;
      }
      req.profile = profile;
      next();
    });
  },

  // Step 3a. Link user accounts.
  function (req, res, next) {
    if (!req.headers[authHeader]) {
      next();
      return;
    }
    var profile = req.profile;
    User.find({ where: { github: profile.id }}, function(err, users) {
      var user = users[0];
      if (user) {
        res.status(409).send({ message: 'There is already a GitHub account that belongs to you' });
        return;
      }
      var token = req.headers[authHeader].split(' ')[1];
      var payload = jwt.decode(token, config.TOKEN_SECRET);
      User.findById(payload.sub, function(err, user) {
        if (!user) {
          res.status(400).send({ message: 'User not found' });
          return;
        }
        user.github = profile.id;
        user.displayName = user.displayName || profile.name;
        user.save(function() {
          res.send({
            // token: createToken(user),
            user: user
          });
        });
      });
    });
  },

  // Step 3b. Create a new user account or return an existing one.
  function (req, res, next) {
    var profile = req.profile;
    var filter = { or: [{ github: profile.id }, { email: profile.email }] };

    User.find({ where: filter }, function(err, users) {
      var user = users[0];
      if (user) {

        if (!user.github) {
          user.github = profile.id;
          user.displayName = user.displayName || profile.name;
          user.save(function() {
            req.user = user;
            next();
          });
          return;
        }

        req.user = user;
        next();
        return;
      }

      User.create({
        displayName: profile.name,
        github: profile.id,
        email: profile.email,
        password: profile.id
      }, function (err, user) {
        req.user = user;
        next();
      });

    });
  },

  function sendAccessToken (req, res) {
    var user = req.user;
    user.createAccessToken(User.settings.ttl, function (err, token) {
      if (err) {
        res.send(err);
        return;
      }
      token.token = createToken(user);
      res.send(token);
    });
  });

