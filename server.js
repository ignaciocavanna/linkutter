import express from "express";
import bodyParser from "body-parser";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pkg from "pg";
import { log } from "console";
import dotenv from "dotenv";
import GoogleStrategy from 'passport-google-oauth2';
import passport from 'passport';
import { Strategy } from "passport-local";
import session from 'express-session';

const app = express();
const port = 3000;
const { Pool } = pkg;

dotenv.config();

const db = new Pool({
  user: "postgres",
  host: "2.tcp.eu.ngrok.io",
  database: "link_shortener",
  password: "postgreadmin",
  port: 19525,
});

db.connect();

// Middlewar
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(express.json());
app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 7 // One week in milliseconds
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Calcolare __dirname con import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configura Express per usare il middleware statico per servire la cartella "public"
app.use(express.static(join(__dirname, "../public")));

// Imposta il motore di rendering per EJS
app.set("view engine", "ejs");
app.set("views", join(__dirname, "views"));

let data = ''
let links = { rows: [] };

// GET home page
app.get("/", async (req, res) => {
  const loggedUser = req.user;
  links = await getLinksFromDB(loggedUser);
  
    res.render('index.ejs',{
        short_link: '',
        long_link: '',
        links: links,
        isAuthenticated: req.isAuthenticated(),
        user: req.user,
    })
}); 

//GET login page
app.get(
  '/auth/google',
  passport.authenticate('google', {
    scope: ['profile', "email"],
}));

//Passport
passport.use(
  "google",
  new GoogleStrategy({

    clientID: '1020954210851-jipaikdchc6sme13mi6s64tqg6pj5nu3.apps.googleusercontent.com',
    clientSecret: "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",
    callbackURL: "https://linkutter.onrender.com/auth/google/secrets",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  }, async (accessToken, refreshToken, profile, cb) => {
    try {
      console.log(profile); 
      return cb(null, profile.email);
    } catch (error) {
      console.log(error);
    }
}));

//GET redirect page
app.get(
  "/auth/google/secrets",
  passport.authenticate("google", {
    successRedirect: "/",
    failureRedirect: "/loginError",
  })
);

//Login error page
app.get("/loginError", (req, res) => {
  res.send("Errore di login");
});

// POST per recuperare l'indirizzo IP dell'utente
app.post("/save-ip", async (req, res) => {
  const loggedUser = req.user;
  console.log(`Utente: ${req.body.ip} ${loggedUser ? "autenticato come " + loggedUser : "non auttenticato"}`);
});

// POST a new link
app.post("/submit-link", async (req, res) => {
    let data = req.body

    try {
    const data = req.body;
    await db.query(
        'INSERT INTO links (long_link, short_link, user_email) VALUES ($1, $2, $3)',
        [data.long_link, data.short_link, req.user]
    );

        res.redirect('/',200,{
            long_link: data.long_link,
            short_link: `ignaciocavanna.com/${data.short_link}`,
            links: links
        })

        } catch (error) {
            console.log(error);
    }
});

// GET a specific link
app.get('/:action', async (req, res) => {
  const action = req.params.action; // Ottieni il valore della variabile dinamica
  console.log(`Azione richiesta: ${action}`);

  try {
    let link = await db.query('SELECT * FROM links')
    let data = link.rows
    
    for (let i=0; i<data.length; i++){
      if (action == data[i].short_link) {
        res.render(`redirectPage.ejs`, {link: data[i].long_link})
      }
    }
  } catch (error) {
    console.log(error);
  }
});

//Passport Local
passport.use(
  "local",
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1 ", [
        username,
      ]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storedHashedPassword = user.password;
        bcrypt.compare(password, storedHashedPassword, (err, valid) => {
          if (err) {
            console.error("Error comparing passwords:", err);
            return cb(err);
          } else {
            if (valid) {
              return cb(null, user);
            } else {
              return cb(null, false);
            }
          }
        });
      } else {
        return cb("User not found");
      }
    } catch (err) {
      console.log(err);
    }
  })
);

//Functions
//Funzione di recupero dei link dal DB
async function getLinksFromDB(user) {
  try {
    if (user !== undefined) {
      const res = await db.query('SELECT * FROM links WHERE user_email = $1', [user]);
      return res.rows; // Restituisce i risultati della query
    } else {
      const res = await db.query('SELECT * FROM links WHERE user_email IS NULL');
      return res.rows; // Restituisce i risultati della query
    }
  } catch (err) {
    console.error("Error executing query: ", err);
    throw err; // Rilancia l'errore per gestirlo altrove
  }
}

passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
