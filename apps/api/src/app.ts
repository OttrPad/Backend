import express from 'express';
import cors from 'cors';
import roomRoutes from './routes/room.Routes'; // make sure path is correct
import 'module-alias/register';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Hello from API Gateway!' });
});
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
  );
  next();
});


app.get('/api', (req, res) => {
  res.json({ message: 'API route is active' });
});

// Mount the room routes on /api
app.use('/api', roomRoutes);

app.listen(PORT, () => {
  console.log(`API Gateway running on http://localhost:${PORT}`);
});
