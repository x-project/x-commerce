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

Model.create = function (url, data) {
  return fetch(url, {
    method: 'post',
    headers: {
      'Content-type': 'application/json'
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

Model.delete = function (url, model_id) {
  url = url + '/' + model_id;
  return fetch(url, {
    method: 'delete'
  })
}