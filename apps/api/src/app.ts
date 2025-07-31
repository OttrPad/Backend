import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Hello from API Gateway!' });
});

// Example of forwarding a request to Core service
app.get('/core-status', async (req, res) => {
  try {
    const response = await fetch('http://localhost:4001/status');
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Could not reach Core service' });
  }
});

app.listen(PORT, () => {
  console.log(`API Gateway running on http://localhost:${PORT}`);
});