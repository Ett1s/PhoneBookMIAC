const express = require('express');
const session = require('express-session');
const { Client } = require('pg');
const path = require('path');

const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: false
}));

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '1234',
  database: 'postgres'
});

client.connect()
  .then(() => console.log('Подключено к PostgreSQL!'))
  .catch(err => console.error('Ошибка подключения:', err));

// Middleware для проверки авторизации
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// Логин
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await client.query(
    'SELECT * FROM app_users WHERE username = $1 AND password = $2',
    [username, password]
  );
  if (result.rows.length === 1) {
    req.session.user = {
      id: result.rows[0].id,
      username: result.rows[0].username,
      role: result.rows[0].role
    };
    res.redirect('/');
  } else {
    res.render('login', { error: 'Неверный логин или пароль' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Главная страница
app.get('/', requireAuth, async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM users');
    const rows = result.rows;
    res.render('table', { rows, user: req.session.user });
  } catch (err) {
    res.send('Ошибка запроса к БД: ' + err.message);
  }
});

// Добавление записи (только admin)
app.post('/add', requireAuth, async (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).send('Нет доступа');
  try {
    const keys = Object.keys(req.body);
    const values = Object.values(req.body);
    if (keys.length === 0) return res.status(400).send('Нет данных');
    const placeholders = keys.map((_, i) => `$${i+1}`).join(',');
    const query = `INSERT INTO users (${keys.join(',')}) VALUES (${placeholders})`;
    await client.query(query, values);
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send('Ошибка добавления: ' + err.message);
  }
});

// Редактирование записи (только admin)
app.post('/edit', requireAuth, async (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).send('Нет доступа');
  try {
    const { id, key, value } = req.body;
    if (!id || !key) return res.status(400).send('Нет id или key');
    const query = `UPDATE users SET ${key} = $1 WHERE id = $2`;
    await client.query(query, [value, Number(id)]);
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send('Ошибка редактирования: ' + err.message);
  }
});

app.listen(port, () => {
  console.log(`Сервер запущен на http://localhost:${port}`);
});