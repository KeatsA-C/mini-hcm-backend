import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import userRoutes from './src/api/user/user.routes.js';
import attendanceRoutes from './src/api/attendance/attendance.routes.js';
import adminRoutes from './src/api/admin/admin.routes.js';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/api/user', userRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/admin', adminRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
