module.exports = function (Article) {

  /* ********************************************************* */
  /*
    * data validation
  */
  Article.validate('published_at', validate_published_at_future, { message: 'invalid past date' });

  function validate_published_at_future (err) {
    var article = this;
    if (!article.published_at) {
      return;
    }
    var published_at = new Date(article.published_at);
    var date_now = Date.now();
    var diff =  published_at - date_now;
    if (diff < 0) {
      err();
    }
  }
  /* ********************************************************* */
};