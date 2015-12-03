module.exports = function (Coupon) {

  /* ********************************************************* */
  /*
    * data validation
  */
  Coupon.validate('date_from', validate_date_from_future, { message: 'invalid past date' });
  function validate_date_from_future (err) {
    var coupon = this;
    if (!coupon.date_from) {
      return;
    }
    var date_from = new Date(coupon.date_from);
    var date_now = Date.now();
    var diff =  date_from - date_now;
    if (diff < 0) {
      err();
    }
  }
  /*------------------------*/
  Coupon.validate('date_to', validate_date_to_future, { message: 'invalid past date' });

  function validate_date_to_future (err) {
    var coupon = this;
    if (!coupon.date_to) {
      return;
    }
    var date_to = new Date(coupon.date_to);
    var date_now = Date.now();
    var diff =  date_to - date_now;
    if (diff < 0) {
      err();
    }
  }

  /* ********************************************************* */
};