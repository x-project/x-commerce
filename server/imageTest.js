var request = require('superagent');
var faker = require('faker');
var async = require('async');
var fs = require('fs');
var casual = require('casual');

function get_files (path, callback) {
  fs.readdir(path, function (err, files) {
    if (err) {
      callback(err, null);
      return;
    }
    callback(null, files);
  });
}

function get_random_int(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

function get_random_file_name (files) {
  return files[get_random_int(0, files.length)]
}

function get_files_list (path) {
  get_files(path, function (err, files) {
    if (err) {
      return;
    }
    var random_file = get_random_file_name(files);
    create_image(random_file, function (next) {

    })
  });
}

get_files_list('./imageTest');


function create_image (file_name, callback) {
  request
    .post('http://localhost:3000/api/images')
    .send({
      filename: file_name,
      extension: file_name
    })
    .type('json')
    .set('X-API-Key', 'foobar')
    .set('Accept', 'application/json')
    .end(callback);
}