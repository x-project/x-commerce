var Model = {};

function status (response) {
  return new Promise(function (resolve, reject) {
    if (response.ok) {
      return response.json().then(resolve);
    }
    return response.json().then(function (response) {
      reject(response.error);
    });
  });
}

Model.create = function (url, data, token) {
  return fetch(url, {
    method: 'post',
    headers: {
      'Content-type': 'application/json',
      'Authorization': token
    },
    body: JSON.stringify(data)
  })
  .then(status);
}

Model.update = function (url, model_id, data) {
  url = url + '/' + model_id;
  return fetch(url, {
    method: 'put',
    headers: {
      'Content-type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  .then(status);
}

Model.delete = function (url) {
  return fetch(url, {
    method: 'delete'
  })
}

Model.find = function (url) {
  return fetch(url, {
    method: 'get'
  })
  .then(status);
}

Model.count = function (url) {
  return fetch(url, {
    method: 'get'
  })
  .then(status);
}