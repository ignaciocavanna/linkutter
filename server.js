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
  log(`Utente: ${userIp}`);

  res.render("index.ejs", {
    short_link: "",
    long_link: "",
    links: links,
    isAuthenticated: req.isAuthenticated(),
    user: req.user,
  });
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
        console.log(profile); // Log del profilo Google
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
  const now = new Date();
  const time = now.toTimeString().split(" ")[0]; // Ottiene l'orario corrente (HH:MM:SS)
  const newUserData = {
    ip: req.body.ip,
    user: req.user ? req.user : "Anonimo",
    time: time,
  };

  console.log(newUserData);
  saveDataIntoJson(newUserData); // Salva i dati nel file JSON
});

// POST: Aggiunge un nuovo link
app.post("/submit-link", async (req, res) => {
  try {
    const data = req.body;
    await db.query(
      "INSERT INTO links (long_link, short_link, user_email) VALUES ($1, $2, $3)",
      [data.long_link, data.short_link, req.user]
    );

    res.redirect("/", 200, {
      long_link: data.long_link,
      short_link: `ignaciocavanna.com/${data.short_link}`,
      links: links,
    });
  } catch (error) {
    console.log(error);
  }
});

// GET: Redirect per un link specifico
app.get("/:action", async (req, res) => {
  const action = req.params.action; // Nome dell'azione
  console.log(`Azione richiesta: ${action}`);

  try {
    let link = await db.query("SELECT * FROM links");
    let data = link.rows;

    for (let i = 0; i < data.length; i++) {
      if (action === data[i].short_link) {
        res.render("redirectPage.ejs", { link: data[i].long_link });
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
      const res = await db.query(
        "SELECT * FROM links WHERE user_email = $1",
        [user]
      );
      return res.rows;
    } else {
      const res = await db.query(
        "SELECT * FROM links WHERE user_email IS NULL"
      );
      return res.rows;
    }
  } catch (err) {
    console.error("Errore nell'esecuzione della query: ", err);
    throw err;
  }
}

// Aggiorna il file JSON con nuovi dati
function saveDataIntoJson(data) {
  const filePath = path.join(__dirname, "src", "data.json");

  fs.readFile(filePath, "utf8", (err, fileContent) => {
    let existingData = [];

    if (err) {
      if (err.code === "ENOENT") {
        console.log("File non trovato, verrà creato un nuovo file.");
      } else {
        console.error("Errore durante la lettura del file:", err);
        return;
      }
    } else {
      try {
        existingData = fileContent.trim()
          ? JSON.parse(fileContent)
          : [];
      } catch (parseErr) {
        console.error("Errore durante il parsing del file JSON:", parseErr);
        return;
      }
    }

    const updatedData = [...existingData, data];

    fs.writeFile(
      filePath,
      JSON.stringify(updatedData, null, 2),
      "utf8",
      (writeErr) => {
        if (writeErr) {
          console.error("Errore durante la scrittura del file:", writeErr);
        } else {
          console.log("Dati salvati correttamente!");
        }
      }
    );
  });
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