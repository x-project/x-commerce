var QUALITY = 80; //[0,100]
var fs = require('fs');
var gm = require('gm');
var mkdirp = require('mkdirp');
var jwt = require('json-web-token');
var async = require('async');
var path = require('path');

var secret = "TOOOPPVIPPP"; // TODO: read from .env
var token_ttl = 1000 * 120; // TODO: read from .env
var sides = [100, 400, 800];  // TODO: read from .env
var storage = 'storage';  // TODO: read from .env

/**
 * resize_image
 * Resize image from the `buffer`
 *
 * @param {Object} options
 *   @param {Buffer} options.buffer
 *   @param {Number} options.side
 *   @param {String} options.filename
 * @param {Function} callback (err, resized_image_buffer)
 */

var resize_image = function (options, callback) {
  var buffer = options.buffer;
  var filename = options.filename;
  var side = options.side;
  callback = callback || function () {};

  if (buffer === undefined) {
    throw new Error('resize_image: `buffer` needed.');
  }

  if (side === undefined) {
    throw new Error('resize_image: `side` needed.');
  }

  gm(buffer, filename)
    .size(function(err, size) {
      if (err) {
        callback(err);
        return;
      }

      if (size.width < side && size.height < side) {
        callback(null);
        return;
      }

      this.resize(side, side);
      this.compress('jpeg');
      this.quality(QUALITY);
      this.toBuffer('jpg', callback);
    });
};

/**
 * create_folder
 *
 */

var create_folder = function (folder_path) {
  return function (done) {
    mkdirp(folder_path, done);
  };
};


/**
 * save_buffer
 *
 */

var save_buffer = function (file_path, buffer) {
  return function (done) {
    fs.writeFile(file_path, buffer, 'binary', done);
  };
};

/**
 * generate_thumbnail
 *
 */

var generate_thumbnail = function (buffer, filename) {
  return function (side, next, done) {
    var options = {
      buffer: buffer,
      filename: filename,
      side: side
    };
    resize_image(options, function (err, resized_buffer) {
      next(err, resized_buffer, side, done);
    });
  };
};

/**
 * save_resized_buffer
 *
 */

var save_resized_buffer = function (folder_path) {
  return function (buffer, side, err, done) {
    var file_name = path.join(folder_path, 'thumb-' + side + '.jpg');
    fs.writeFile(file_name, buffer, 'binary', function () {
      // console.log(folder_path, file_name, side);
      done();
    });
  };
};

/**
 * generate_and_save_thumbnails
 *
 */

var generate_and_save_thumbnails = function (buffer, sides, filename, folder_path) {
  return function (done) {
    async.each(sides, async.seq(
      generate_thumbnail(buffer, filename),
      save_resized_buffer(folder_path)
    ), done);
  };
};


/**
 * update_db
 *
 */

var update_db = function (Image, image, sides) {
  return function (done) {
    Image.upsert(image, done);
  };
};

module.exports = function(Image) {

  /**
   * Observer - after save
   */

  Image.observe('after save', function (ctx, next) {
    var image = ctx.instance;

    if (image.container.match(/\.\./)) {
      var msg = 'Error: `container` can\'t cointain `../`';
      console.log(msg);
      next(msg);
      return;
    }

    var payload = {
      id: image.id,
      check: secret,
      container: image.container
    };

    jwt.encode(secret, payload, function (err, token) {
      if (err) {
        next(err);
        return;
      }

      image.signed_url = '/api/Images/upload?media_token=' + encodeURIComponent(token);
      next();
    });
  });

  /**
   * Image upload
   */

  Image.upload = function(media_token, req, done) {
     jwt.decode(secret, media_token, function (err, payload) {
        if (err) {
            done(err);
            return;
        }

        var image_id = payload.id;
        var container = payload.container;
        var expired = payload.expires < Date.now();

        var file = req.files.file;
        var image_buffer = file.buffer;
        var filename = file.originalname;
        var extension = filename.slice(filename.lastIndexOf('.'));
        var filename_no_ext = filename.slice(0, -extension.length);
        var folder_path = path.join(__dirname, '..', storage, container, image_id);
        var file_path = path.join(folder_path, 'original' + extension);
        var image = {
          id: image_id,
          container: container,
          extension: extension,
          filename: filename_no_ext,
          size: file.size,
          base_url: '/' + path.join(storage, container, image_id)
        };

        if (payload.check !== secret || expired) {
          var msg = 'Error: media_token expired or not valid';
          console.log(msg);
          done(msg);
          return;
        }

        async.series([
          create_folder(folder_path),
          save_buffer(file_path, image_buffer),
          generate_and_save_thumbnails(image_buffer, sides, filename, folder_path),
          update_db(Image, image, sides)
        ], function (err, results) {
          setImmediate(done, err, results[3]);
        });
    });
  };

  Image.remoteMethod('upload', {
    accepts: [
      { arg: 'media_token', type: 'string', http: { source: 'query' } },
      { arg: 'req', type: 'object', http: { source: 'req' } }
    ],
    returns: { arg: 'image', type: 'object' },
    http: { path: '/upload', verb: 'post' }
  });

};