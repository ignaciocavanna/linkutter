import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import path from "path";
import pkg from "pg";
import { log } from "console";
import dotenv from "dotenv";
import GoogleStrategy from "passport-google-oauth2";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";

const app = express();
const port = 3000;
const { Pool } = pkg;

dotenv.config();

// Configurazione del database PostgreSQL
const db = new Pool({
  //LOCAL DEV CONFIG
  //user: "postgres",
  //host: "localhost",
  //database: "link_shortener",
  //password: "postgreadmin",
  //port: "5432",

  //WAN PRODUCTION CONFIG
  connectionString: 'postgres://postgre:tFxzwaxdKRZU2Bdop44spXJge1niA59O@dpg-cu17k85svqrc73eoq3ug-a:5432/link_shortener_3qfh'
});

// Connessione al database
db.connect();

// Middleware
app.use(bodyParser.urlencoded({ extended: true })); // Parsing delle URL
app.use(bodyParser.json()); // Parsing del body in formato JSON
app.use(express.static("public")); // Servizio di file statici
app.use(express.json());
app.use(
  session({
    secret: "secret", // Chiave segreta per la sessione
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 7, // Una settimana in millisecondi
    },
  })
);

app.use(passport.initialize()); // Inizializza Passport.js
app.use(passport.session()); // Configura Passport.js per le sessioni

// Determina il percorso assoluto del file attuale
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configura Express per utilizzare EJS come motore di rendering
app.set("view engine", "ejs");
app.set("views", join(__dirname, "views"));

// Variabili globali
let data = "";
let links = { rows: [] };

// Rotte
// GET: Home page
app.get("/", async (req, res) => {
  const loggedUser = req.user;
  links = await getLinksFromDB(loggedUser); // Recupera i link dal DB
  const userIp = req.connection.remoteAddress; // Indirizzo IP dell'utente

  res.render("index.ejs", {
    links: links,
    isAuthenticated: req.isAuthenticated(),
    user: req.user,
  });
});

// GET: Dashboard personale con link
app.get("/dashboard", async (req, res) => {
  const loggedUser = req.user;

  try {
    if (req.isAuthenticated()) {

      const data = await db.query(
      "SELECT l.user_id, l.short_link, l.long_link, ld.ip, ld.username, TO_CHAR(l.created_at, 'DD-MM-YYYY HH24:MI') AS formatted_created, TO_CHAR(ld.opened_at, 'DD-MM-YYYY HH24:MI') AS formatted_open FROM links l INNER JOIN links_data ld ON l.id = ld.link_id WHERE l.user_id = (SELECT id FROM users WHERE email = $1) ORDER BY opened_at DESC",
      [req.user]);

      res.render("dashboard.ejs", {data: data.rows});

    } else { res.redirect("/"); }

  } catch (error) {
    console.log(error);   
  }

});

// GET: Pagina con i link
app.get("/dashboard/links", async (req, res) => {

  const loggedUser = req.user;
  const userId = await db.query("SELECT id FROM users WHERE email = ($1)",    
    [loggedUser]
   )
  
  try {
    if (req.isAuthenticated()) {
      const data = await db.query(
        "SELECT short_link, long_link, TO_CHAR(links.created_at, 'DD-MM-YYYY HH24:MI') AS formatted_created FROM links WHERE user_id = $1",
        [userId.rows[0].id]
      );
  
      res.render("links.ejs", {data: data.rows});
    } else {
      res.redirect("/");
    }

  } catch (error) {
    console.log(error);
  }

});

// GET: Pagina per la gestione del profilo personale
app.get("/dashboard/profile", (req, res) => {
  try {
    if (req.isAuthenticated()) {
      res.render("profile.ejs", { user: req.user });
    } else {
      res.redirect("/");
    }
  } catch (error) {
    console.log(error);
  }

});

//GET: 

// GET: Pagina dettaglio del link
app.get("/dashboard/links/:short_link", async (req, res) => {

  try {
    if (req.isAuthenticated()) {
      const link = await db.query("SELECT * FROM links WHERE short_link = $1", [req.params.short_link]);
      const data = await db.query("SELECT *, TO_CHAR(opened_at, 'DD-MM-YYYY HH24:MI') AS formatted_opening FROM links_data WHERE link_id = $1", [link.rows[0].id]);
      
      res.render("linkDetails.ejs", {link: link.rows[0], data: data.rows});
    } else {
      res.redirect("/");
    }
  } catch (error) {
    console.log(error);    
  }
});

// GET: Login con Google
app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

// Configura Passport con strategia Google OAuth2
passport.use(
  "google",
  new GoogleStrategy(
    {
      clientID:
        "1020954210851-jipaikdchc6sme13mi6s64tqg6pj5nu3.apps.googleusercontent.com",
      clientSecret: "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",
      callbackURL: "https://linkutter.onrender.com/auth/google/secrets",
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    async (accessToken, refreshToken, profile, cb) => {
      try {
        const userData = profile._json;
        const userExisting = await db.query(
          "SELECT email FROM users WHERE email = $1",
          [userData.email]
        );

        if (userExisting.rows.length > 0) {
          await db.query(
            "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE email = $1",
            [userData.email]
          );
          return cb(null, profile.email);

        } else {
          await db.query(
            "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)",
            [userData.name, userData.email, "GoogleOAuth"]
          );
        }

        return cb(null, profile.email);
      } catch (error) {
        console.log(error);
      }
    }
  )
);

// GET: Redirect dopo l'autenticazione con Google
app.get(
  "/auth/google/secrets",
  passport.authenticate("google", {
    successRedirect: "/", // Redirect alla home in caso di successo
    failureRedirect: "/loginError", // Redirect in caso di errore
  })
);

// GET: Pagina di errore per il login
app.get("/loginError", (req, res) => {
  res.send("Errore di login");
});

// POST: Salva l'indirizzo IP dell'utente
app.post("/save-ip", async (req, res) => {
  const user = req.user ? req.user : "Anonimo";  
  const link_id = await db.query("SELECT id FROM links WHERE short_link = $1", [req.body.link]);

  await db.query(
    "INSERT INTO links_data (link_id, ip, username, opened_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)",
    [link_id.rows[0].id, req.body.ip, user]
  );
});

// POST: Aggiunge un nuovo link
app.post("/submit-link", async (req, res) => {
  try {
    const data = req.body;
    
    const findUserInDB = await db.query("SELECT id FROM users WHERE email = $1", [req.user]);
    const user_id = findUserInDB.rows[0].id;
    
    await db.query(
      "INSERT INTO links (user_id, short_link, long_link, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)",
      [user_id, data.short_link, data.long_link]
    );

    res.redirect("/", 200);
  } catch (error) {
    console.log(error);
  }
});

// GET: Redirect per un link specifico
app.get("/:action", async (req, res) => {
  const action = req.params.action; // Nome dell'azione

  try {
    let link = await db.query("SELECT * FROM links");
    let data = link.rows;

    for (let i = 0; i < data.length; i++) {
      if (action === data[i].short_link) {
        res.render("redirectPage.ejs", {short_link: data[i].short_link, long_link: data[i].long_link });
      }
    }
    
  } catch (error) {
    console.log(error);
  }
});

// Configura Passport con strategia Local
passport.use(
  "local",
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1", [
        username,
      ]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storedHashedPassword = user.password;
        bcrypt.compare(password, storedHashedPassword, (err, valid) => {
          if (err) {
            console.error("Errore nel confronto delle password:", err);
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
        return cb("Utente non trovato");
      }
    } catch (err) {
      console.log(err);
    }
  })
);

// Funzioni
// Recupera i link dal database
async function getLinksFromDB(user) {
  try {
    if (user !== undefined) {
      const userId = await db.query(
        "SELECT id FROM users WHERE email = $1",
        [user]
      );

      const res = await db.query(
        "SELECT * FROM links WHERE user_id = $1",
        [userId.rows[0].id]
      );

      return res.rows;
    } else {
      const res = await db.query(
        "SELECT * FROM links WHERE user_id IS NULL"
      );
      return res.rows;
    }
  } catch (err) {
    console.error("Errore nell'esecuzione della query: ", err);
    throw err;
  }
}

//Data e ora
function time() {
  const now = new Date();
  const time = now.toTimeString().split(" ")[0]; // Ottiene l'orario corrente (HH:MM:SS)
  return time;
}

// Configura la serializzazione e deserializzazione di Passport
passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});

// Avvia il server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
