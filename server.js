const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3456;

// Health check - must be first route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', port: PORT });
});

// Root
app.get('/', (req, res) => {
  res.send('Family Calendar API is running!');
});

// Static files
app.use(express.static('public'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
