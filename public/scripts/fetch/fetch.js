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

Model.update = function (url, data) {
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

Model.find = function (url, filter, token) {
  var _get_filter = function () {
    return {
      where: filter.where,
      order: filter.order,
      skip: filter.page ? filter.page * filter.perpage : 0,
      limit: filter.perpage,
      include: filter.include
    };
  };
  url = url + '?' + 'filter=' + JSON.stringify(_get_filter());
  return fetch(url, {
    method: 'get',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      Authorization: token
    },
  })
  .then(status);
}

Model.count = function (url) {
  return fetch(url, {
    method: 'get',
      'Accept': 'application/json',
    })
  .then(status);
}