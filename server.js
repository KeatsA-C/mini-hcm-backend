import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import userRoutes from './src/api/user/user.routes.js';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/api/user', userRoutes);
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
