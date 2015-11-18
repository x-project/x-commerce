var aws = require('aws-sdk');

module.exports = function (Resource) {

  var AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY;
  var AWS_SECRET_KEY = process.env.AWS_SECRET_KEY;
  var S3_BUCKET = process.env.S3_BUCKET;
  var S3_REGION = process.env.S3_REGION;

  aws.config.update({accessKeyId: AWS_ACCESS_KEY , secretAccessKey: AWS_SECRET_KEY });
  aws.config.update({region: S3_REGION , signatureVersion: 'v4' });

  Resource.signed_put = function(file_name, file_type, callback) {
    var s3 = new aws.S3();
    var s3_params = {
      Bucket: S3_BUCKET,
      Key: file_name,
      Expires: 60,
      ContentType: file_type,
      ACL: 'public-read'
    };
    s3.getSignedUrl('putObject', s3_params, function (err, signed_url) {
      if (err) {
        callback(err);
        return;
      }
      callback(null, signed_url);
    });
  };

  Resource.remoteMethod('signed_put', {
    http: { verb: 'get' },
    accepts: [
      {arg: 'file_name', type: 'string'},
      {arg: 'file_type', type: 'string'}
    ],
    returns: {arg: 'signed_url', type: 'string'}
  });


  Resource.signed_list = function (folder, callback) {
    var s3 = new aws.S3();
    var s3_params = {
      Bucket: S3_BUCKET,
      EncodingType: 'url',
      // Delimiter: 'STRING_VALUE',
      // Marker: 'STRING_VALUE',
      Prefix: folder,
      MaxKeys: 1000
    };
    s3.getSignedUrl('listObjects', s3_params, function (err, signed_url) {
      if (err) {
        callback(err);
        return;
      }
      callback(null, signed_url);
    });
  };

  Resource.remoteMethod('signed_list', {
    http: { verb: 'get' },
    accepts: { arg: 'folder', type: 'string' },
    returns: { arg: 'signed_url', type: 'string' }
  });

  Resource.signed_delete = function(file_name, callback) {
    var s3 = new aws.S3();
    var s3_params = {
      Bucket: S3_BUCKET,
      Key: file_name
    };
    s3.getSignedUrl('deleteObject', s3_params, function (err, signed_url) {
      if (err) {
        callback(err);
        return;
      }
      callback(null, signed_url);
    });
  };

  Resource.remoteMethod('signed_delete', {
    http: { verb: 'get' },
    accepts: {arg: 'file_name', type: 'string'},
    returns: {arg: 'signed_url', type: 'string'}
  });

};