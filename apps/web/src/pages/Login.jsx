import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLogin } from '../hooks/useAuth.js';
import styles from './Auth.module.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const navigate = useNavigate();

  function handleSubmit(e) {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate('/') });
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <h1 className={styles.title}>Cut</h1>
        <p className={styles.subtitle}>Log in to your tracker</p>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <label className={styles.label} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {login.isError && <p className={styles.error}>{login.error.message}</p>}
          <button className={styles.submit} type="submit" disabled={login.isPending}>
            {login.isPending ? 'Logging in...' : 'Log in'}
          </button>
        </form>
        <p className={styles.switch}>
          No account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
