require("dotenv").config();
const express = require("express");
const app = express();
const morgan = require("morgan");

const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");

const { check, validationResult } = require("express-validator");
const { Movie, User } = require("./models.js");
const passport = require("passport");

console.log("MongoDB Connection URI:", process.env.CONNECTION_URI);
mongoose
  .connect(process.env.CONNECTION_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Error connecting to MongoDB:", err));

const fs = require("fs");
const fileUpload = require("express-fileupload");
const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");

const s3Client = new S3Client({
  region: "us-east-1",
});
const listObjectsParams = {
  Bucket: "my-bucket-for-uploading-retrieving-listing-objects",
};
listObjectsCmd = new ListObjectsV2Command(listObjectsParams);
s3Client.send(listObjectsCmd);

const ALLOWED_ORIGINS = ["*"];

// app.use(
//   cors({
//     credentials: true,
//     origin: function (origin, callback) {
//       if (!origin || ALLOWED_ORIGINS.indexOf(origin) !== -1) {
//         callback(null, true);
//       } else {
//         callback(new Error("Not allowed by CORS"));
//       }
//     },
//   })
// );
app.use(cors());
app.options("*", cors());
//app.use(bodyParser.json());
app.use(express.json());
app.use((req, res, next) => {
  console.log(req.body);
  next();
});
app.use(fileUpload());
app.use(express.static("public"));
app.use(morgan("common"));

let auth = require("./auth")(app);
require("./passport");

app.post("/upload/:movieTitle", async (req, res) => {
  const { image } = req.files; // Assuming you're using express-fileupload
  const movieTitle = req.params.movieTitle;

  //Assuming the file path is specified in the movies.json file
  const filePath = "AWS_movie_api/movies.json";

  //Read the movies.json file to get the list of movies
  const moviesData = fs.readFileSync(filePath, "utf-8");
  const movies = JSON.parse(moviesData);

  //Find the movie with the specified title
  const selectedMovie = movies.find((movie) => movie.Title === movieTitle);

  if (!selectedMovie) {
    return res.status(404).send("Movie not found");
  }

  //Extract the image URL from the selected movie object
  const imageURL = selectedMovie.ImageURL;

  //Assuming the images are stored locally in the "public/images" directory
  const localImagePath = `public/images/${imageURL.split("/").pop()}`;

  const params = {
    Bucket: "my-bucket-for-uploading-retrieving-listing-objects", // Update with your S3 bucket name
    Key: imageURL.split("/").pop(), // Use the image file name as the S3 key
    Body: fs.createReadStream(localImagePath),
  };

  try {
    const data = await s3Client.send(new PutObjectCommand(params));
    console.log(
      `Successfully uploaded image for ${selectedMovie.Title} to S3:`,
      data
    );
    res
      .status(200)
      .send(`Image for ${selectedMovie.Title} uploaded successfully`);
  } catch (error) {
    console.error(
      `Error uploading image for ${selectedMovie.Title} to S3:`,
      error
    );
    res.status(500).send("Error uploading image to S3");
  }
});

app.get("/list", async (req, res) => {
  try {
    const data = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: "my-bucket-for-uploading-retrieving-listing-objects",
      })
    );
    console.log("Objects in S3 bucket:", data.Contents);
    res.status(200).json(data.Contents);
  } catch (error) {
    console.error("Error listing objects in S3:", error);
    res.status(500).send("Error listing objects in S3");
  }
});

app.get("/retrieve/:key", async (req, res) => {
  const key = req.params.key;
  const params = {
    Bucket: "my-bucket-for-uploading-retrieving-listing-objects", // Update with your S3 bucket name
    Key: key,
  };

  try {
    const data = await s3Client.send(new GetObjectCommand(params));
    console.log("Retrieved object from S3:", data);
    res.status(200).send(data.Body.toString("utf-8"));
  } catch (error) {
    console.error("Error retrieving object from S3:", error);
    res.status(500).send("Error retrieving object from S3");
  }
});

/**
 * Default route for handling GET requests.
 * @name GET /
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */

app.get("/", (req, res) => {
  res.send("Welcome to Cinedex!");
});

/**
 * Endpoint for user registration.
 * @name POST /users
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */

app.post(
  "/users",
  [
    check("Username", "Username is required").isLength({ min: 5 }),
    check(
      "Username",
      "Username contains non alphanumeric characters - not allowed."
    ).isAlphanumeric(),
    check("Password", "Password is required").not().isEmpty(),
    check("Email", "Email does not appear to be valid").isEmail(),
  ],

  (req, res) => {
    let errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    let hashedPassword = User.hashPassword(req.body.Password);
    User.findOne({ Username: req.body.Username }).then((user) => {
      if (user) {
        return res.status(400).send(req.body.Username + " " + "already exists");
      } else {
        User.create({
          Username: req.body.Username,
          Password: hashedPassword,
          Email: req.body.Email,
          Birthday: req.body.Birthday,
        })
          .then((user) => {
            res.status(201).json(user);
          })
          .catch((error) => {
            console.error(error);
            res.status(500).send("Error: " + error);
          });
      }
    });
  }
);
/**
 * Retrieve information about the currently authenticated user.
 * @name GET /users
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */

app.get(
  "/users",
  passport.authenticate("jwt", { session: false }),
  (req, res) => {
    User.findById(req.user._id) //passport gets the current user from the token and saves the user data in req.user
      .select("-Password")
      .populate("FavoriteMovies")
      .then((user) => {
        res.json(user);
      })
      .catch((err) => {
        console.error(err);
        res.status(500).send("Error: " + err);
      });
  }
);
/**
 * Update user profile information.
 * @name PUT /users/:Username
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */

app.put(
  "/users/:Username",
  passport.authenticate("jwt", { session: false }),
  (req, res) => {
    const userEditInfo = {
      Username: req.body.Username,
      Email: req.body.Email,
      Birthday: req.body.Birthday,
    };

    if (
      typeof req.body.Password == "string" &&
      req.body.Password.trim().length > 0
    ) {
      userEditInfo.Password = User.hashPassword(req.body.Password);
    }

    User.findOneAndUpdate(
      { _id: req.user._id }, //passport gets the current user from the token and saves the user data in req.user
      {
        $set: userEditInfo,
      },
      { new: true }
    )
      .then((updatedUser) => {
        res.status(200).json(updatedUser);
      })
      .catch((err) => {
        console.error(err);
        res.status(500).send("Error: " + err);
      });
  }
);
/**
 * Add a movie to the user's favorite movies list.
 * @name POST /users/:Username/movies/:MovieID
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */

app.post(
  "/users/:Username/movies/:MovieID",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    try {
      await User.findOneAndUpdate(
        { _id: req.user._id },
        {
          $addToSet: { FavoriteMovies: req.params.MovieID },
        },
        { new: true }
      );
      // Assuming the file path is specified in the movies.json file
      const filePath = "AWS_movie_api/movies.json";
      // Read the movies.json file to get the list of movies
      const moviesData = fs.readFileSync(filePath, "utf-8");
      const movies = JSON.parse(moviesData);

      // Find the movie with the specified title
      const selectedMovie = movies.find(
        (movie) => movie._id === req.params.MovieID
      );

      if (!selectedMovie) {
        return res.status(404).send("Movie not found");
      }
      // Extract the image URL from the selected movie object
      const imageURL = selectedMovie.ImageURL;

      // Assuming the images are stored locally in the "public/images" directory
      const localImagePath = `public/images/${imageURL.split("/").pop()}`;

      // Upload the original image to the S3 bucket's original-images folder
      const paramsOriginal = {
        Bucket: "my-bucket-for-uploading-retrieving-listing-objects", // Update with your S3 bucket name
        Key: `original-images/${imageURL.split("/").pop()}`,
        Body: fs.createReadStream(localImagePath),
      };

      const uploadOriginalData = await s3Client.send(
        new PutObjectCommand(paramsOriginal)
      );
      console.log(
        `Successfully uploaded original image for ${selectedMovie.Title} to S3:`,
        uploadOriginalData
      );

      res.status(200).json({
        message: `${selectedMovie.Title} was added to your Favorite Movies list.`,
      });
    } catch (error) {
      console.error("Error: ", error);
      res.status(500).send("Error: " + error);
    }
  }
);

/**
 * Remove a movie from the user's favorite movies list.
 * @name DELETE /users/:Username/movies/:MovieID
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */

app.delete(
  "/users/:Username/movies/:MovieID",
  passport.authenticate("jwt", { session: false }),
  (req, res) => {
    User.findOneAndUpdate(
      { _id: req.user._id },
      {
        $pull: { FavoriteMovies: req.params.MovieID },
      },
      { new: true }
    )
      .then(() => {
        res
          .status(200)
          .send(req.params.MovieID + " was deleted from Favorite Movies List.");
      })
      .catch((err) => {
        res.status(500).send("Error: " + err);
      });
  }
);
/**
 * Delete a user account.
 * @name DELETE /users/:Username
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */

app.delete("/users/:Username", (req, res) => {
  User.findOneAndRemove({ Username: req.params.Username })
    .then(() => {
      res.status(200).json({ message: req.params.Username + " was deleted." });
    })
    .catch((err) => {
      res.status(500).send("Error: " + err);
    });
});
/**
 * Serve documentation page.
 * @name GET /documentation
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
app.get("/documentation", (req, res) => {
  res.sendFile("public/documentation.html", { root: __dirname });
});
/**
 * Get a list of all movies.
 * @name GET /movies
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */

app.get(
  "/movies",
  passport.authenticate("jwt", { session: false }),
  (req, res) => {
    Movie.find()
      .then((movies) => {
        res.status(200).json(movies);
      })
      .catch((err) => {
        console.error(err);
        res.status(500).send("Error: " + err);
      });
  }
);
/**
 * Get data about a single movie by name.
 * @name GET /movies/:Title
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */

app.get(
  "/movies/:Title",
  passport.authenticate("jwt", { session: false }),
  (req, res) => {
    Movie.findOne({ Title: req.params.Title })
      .then((movie) => {
        res.json(movie);
      })
      .catch((err) => {
        console.error(err);
        res.status(500).send("Error: " + err);
      });
  }
);
/**
 * Get data about a genre by name.
 * @name GET /movies/genre/:genreName
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */

app.get(
  "/movies/genre/:genreName",
  passport.authenticate("jwt", { session: false }),
  (req, res) => {
    Movie.findOne({ "Genre.Name": req.params.genreName }, "Genre")
      .then((movies) => {
        res.status(200).json(movies);
      })
      .catch((err) => {
        console.error(err);
        res.status(500).send("Error: " + err);
      });
  }
);
/**
 * Get data about a director by name.
 * @name GET /movies/director/:directorName
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */

app.get(
  "/movies/director/:directorName",
  passport.authenticate("jwt", { session: false }),
  (req, res) => {
    Movie.find({ "Director.Name": req.params.directorName }, "Director")
      .then((movies) => {
        res.status(200).json(movies);
      })
      .catch((err) => {
        console.error(err);
        res.status(500).send("Error: " + err);
      });
  }
);
/**
 * Error-handling middleware.
 * @name use-error-handler
 * @function
 * @param {Object} err - Error object.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next function.
 */

app.use((err, req, res, next) => {
  console.log(err);
  console.error(err.stack);
  res.status(500).send("Something broke!");
});
/**
 * Listen for requests.
 * @name listen
 * @function
 * @param {number} port - Port number.
 */
const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log("Listening on port " + port);
});
