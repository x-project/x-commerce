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