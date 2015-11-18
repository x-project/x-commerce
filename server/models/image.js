var QUALITY = 80; //[0,100]
var graphicsmagick = require('gm');
var fs = require('fs');
var mkdirp = require('mkdirp');
var jwt = require('json-web-token');
var async = require('async');
var path = require('path');

var secret = "TOOOPPVIPPP"; // TODO: read from .env
var token_ttl = 1000 * 120; // TODO: read from .env
var sides = [50, 80, 120, 400, 800];  // TODO: read from .env
var storage = 'public/storage';  // TODO: read from .env

/**
 * check
 *
 */

var check = function (x_data) {
  return function (done) {
    var err = null
    if (x_data.image_buffer === undefined) {
      err = new Error('`image_buffer` is mandatory.');
    };
    setImmediate(done, err);
  };
};

/**
 * gm
 *
 */

var gm = function (side, x_data) {
  return function (done) {
    var data_side = x_data[side] = {};
    data_side.gm = graphicsmagick(x_data.image_buffer, x_data.filename);
    setImmediate(done);
  };
};

/**
 * if_size
 *
 */

var if_size = function (side, x_data) {
  return function (done) {
    var data_side = x_data[side];
    var gm = data_side.gm;
    data_side.skipped = false;
    gm.size(function(err, size) {
      if (size && size.width < side && size.height < side) {
        data_side.skipped = true;
      }
      setImmediate(done, err);
    });
  };
};

/**
 * resize
 *
 */

var resize = function (side, x_data) {
  return function (done) {
    var data_side = x_data[side];
    var gm = data_side.gm;

    if(data_side.skipped) {
      setImmediate(done);
      return;
    }

    gm.resize(side, side);
    gm.compress('jpeg');
    gm.quality(QUALITY);
    gm.toBuffer('jpg', function (err, resized_buffer) {
      data_side.buffer = resized_buffer;
      setImmediate(done, err);
    });
  };
};


/**
 * save
 *
 */

var save = function (side, x_data) {
  return function (done) {
    var data_side = x_data[side];
    var gm = data_side.gm;
    var file = path.join(x_data.folder_path, 'thumb-' + side + '.jpg');

    if(data_side.skipped) {
      setImmediate(done);
      return;
    }

    fs.writeFile(file, data_side.buffer, 'binary', done);
  };
};

/**
 * add
 *
 */

var add = function (side, x_data) {
  return function (done) {
    var data_side = x_data[side];

    if(!data_side.skipped) {
      x_data.thumbs.push(side);
    }

    setImmediate(done);
  };
};

/**
 * clean
 *
 */

var clear = function (side, x_data) {
  return function (done) {
    delete x_data[side];
    setImmediate(done);
  };
}


/**
 * create_folder
 *
 */

var create_folder = function (x_data) {
  return function (done) {
    mkdirp(x_data.folder_path, function (err, res) {
      setImmediate(done, err);
    });
  };
};

/**
 * thumbnail
 * Generate and save one thumbnail for the given size.
 *
 */

var thumbnail = function (x_data) {
  return function (side, next) {
    async.waterfall([
      gm(side, x_data),
      if_size(side, x_data),
      resize(side, x_data),
      save(side, x_data),
      add(side, x_data),
      clear(side, x_data),
    ], next);
  };
};

/**
 * thumbnails
 * Generate and save all the thumbnails for the given size.
 *
 */

var thumbnails = function (x_data) {
  return function (done) {
    async.eachLimit(x_data.sides, 4, thumbnail(x_data), done)
  };
};

/**
 * save_buffer
 *
 */

var save_buffer = function (x_data) {
  return function (done) {
    fs.writeFile(x_data.file_path, x_data.image_buffer, 'binary', done);
  };
};


/**
 * update_image
 *
 */

var update_image = function (x_data) {
  return function (done) {
    var image = x_data.image;
    image.thumbs = x_data.thumbs;
    x_data.Image.upsert(image, done);
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

      image.signed_url = '/api/' + Image.settings.plural + '/upload?media_token=' + encodeURIComponent(token);
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
          base_url: path.join(storage, container, image_id)
        };

        var x_data = {
          image_buffer: image_buffer,
          folder_path: folder_path,
          file_path: file_path,
          filename: filename,
          skipped_sizes: [],
          sides: sides,
          image: image,
          Image: Image,
          thumbs: []
        };

        if (payload.check !== secret || expired) {
          var msg = 'Error: media_token expired or not valid';
          console.log(msg);
          done(msg);
          return;
        }

        async.waterfall([
          check(x_data),
          create_folder(x_data),
          save_buffer(x_data),
          thumbnails(x_data),
          update_image(x_data)
        ], function (err, result) {
          setImmediate(done, err, result);
        });
    });
  };

  Image.remoteMethod(
      'upload',
      {
        accepts: [
          {arg: 'media_token', type: 'string', http: {source: 'query'}},
          {arg: 'req', type: 'object', http: {source: 'req'}}
        ],
        returns: {arg: 'image', type: 'object'},
        http: {path: '/upload', verb: 'post'}
      }
  );
};
