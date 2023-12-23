const jwtSecret = "your_jwt_secret"; //This has to be the same key used in the JWTStrategy
const jwt = require("jsonwebtoken"),
  passport = require("passport");
require("./passport"); //Your local passport file
/**
 * Generates a JWT token for the given user.
 * @function
 * @name generateJWTToken
 * @param {Object} user - User object for whom the token is generated.
 * @returns {string} JWT token.
 */
let generateJWTToken = (user) => {
  return jwt.sign(user, jwtSecret, {
    subject: user.Username, //This is the username you're encoding in the JWT
    expiresIn: "7d", //This specifies that the token will expire in 7 days
    algorithm: "HS256", //This is the algorithm used to sign or encode the values of the JWT
  });
};

/**
 * Handles the login process.
 * @function
 * @name handleLogin
 * @param {Object} router - Express router object.
 */

module.exports = (router) => {
  /**
   * POST /login - Authenticates user and returns a JWT token.
   * @name POST /login
   * @function
   * @memberof handleLogin
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   */
  router.post("/login", (req, res) => {
    passport.authenticate("local", { session: false }, (error, user, info) => {
      if (error || !user) {
        return res.status(400).json({
          message: "Something is not right.",
          user: user,
        });
      }
      req.login(user, { session: false }, (error) => {
        if (error) {
          res.send(error);
        }
        let token = generateJWTToken(user.toJSON());
        return res.json({ user, token });
      });
    })(req, res);
  });
};
