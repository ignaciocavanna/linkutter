import express from 'express'
import pg from 'pg'

    // Configura il router
const router = express.Router();

// Configura il pool PostgreSQL
const pool = new pg.Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

// API GET: Ottieni dati dal database
router.get('/data', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tua_tabella;');
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Errore nella query:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// API POST: Inserisci dati nel database
router.post('/data', async (req, res) => {
  const { colonna1, colonna2 } = req.body;
  try {
    await pool.query('INSERT INTO tua_tabella (colonna1, colonna2) VALUES ($1, $2)', [colonna1, colonna2]);
    res.status(201).json({ message: 'Dati salvati con successo!' });
  } catch (error) {
    console.error('Errore nell\'inserimento:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

module.exports = router