
// TWITTER
app.get('/auth/twitter',
  // Step 1. Obtain request token for the authorization popup.
  function(req, res, next) {
    var requestTokenUrl = 'https://api.twitter.com/oauth/request_token';
    var accessTokenUrl = 'https://api.twitter.com/oauth/access_token';
    var authenticateUrl = 'https://api.twitter.com/oauth/authenticate';

    // Step 2. Redirect to the authorization screen.
    if (!req.query.oauth_token || !req.query.oauth_verifier) {
      var requestTokenOauth = {
        consumer_key: config.TWITTER_KEY,
        consumer_secret: config.TWITTER_SECRET,
        callback: config.TWITTER_CALLBACK
      };

      request.post({ url: requestTokenUrl, oauth: requestTokenOauth }, function(err, response, body) {
        var oauthToken = qs.parse(body);
        var params = qs.stringify({ oauth_token: oauthToken.oauth_token });

        res.redirect(authenticateUrl + '?' + params);
      });
      return;
    }

    // Step 3. Exchange oauth token and oauth verifier for access token.
    var accessTokenOauth = {
      consumer_key: config.TWITTER_KEY,
      consumer_secret: config.TWITTER_SECRET,
      token: req.query.oauth_token,
      verifier: req.query.oauth_verifier
    };

    request.post({ url: accessTokenUrl, oauth: accessTokenOauth }, function(err, response, profile) {
      if (err) {
        res.status(500).send(err);
        return;
      }
      req.profile = qs.parse(profile);
      next();
    });
  },

  // Step 4a. Link user accounts.
  function (req, res, next) {
    if (!req.headers[authHeader]) {
      next();
      return;
    }

    User.find({ where: { twitter: profile.user_id }}, function(err, users) {
      var user = users[0];
      if (user) {
        res.status(409).send({ message: 'There is already a Twitter account that belongs to you' });
        return;
      }
      var token = req.headers[authHeader].split(' ')[1];
      var payload = jwt.decode(token, config.TOKEN_SECRET);
      User.findById(payload.sub, function(err, user) {
        if (!user) {
          res.status(400).send({ message: 'User not found' });
          return;
        }
        user.twitter = profile.user_id;
        user.displayName = user.displayName || profile.screen_name;
        user.save(function(err) {
          res.send({
            // token: createToken(user),
            user: user
          });
        });
      });
    });
  },

  // Step 4b. Create a new user account or return an existing one.
  function (req, res, next) {
    var prifile = req.profile;
    var filter = { or: [{ twitter: profile.user_id }, { email: profile.email }] };

    User.find({ where: filter }, function(err, users) {
      var user = users[0];

      if (user) {
        if (!user.twitter) {
          user.twitter = profile.user_id;
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
        yahoo: profile.user_id,
        email: profile.email,
        password: profile.user_id
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