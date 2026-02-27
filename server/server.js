const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors()); // Autorise le cross-origin
app.use(express.json()); // Permet de lire le corps des requêtes JSON

app.listen(PORT, () => console.log(`Serveur sur port ${PORT}`));