import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRegister } from '../hooks/useAuth.js';
import styles from './Auth.module.css';

export default function Register() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const register = useRegister();
  const navigate = useNavigate();

  function handleSubmit(e) {
    e.preventDefault();
    register.mutate({ displayName, email, password }, { onSuccess: () => navigate('/') });
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <h1 className={styles.title}>Cut</h1>
        <p className={styles.subtitle}>Create your account</p>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="displayName">
            Name
          </label>
          <input
            id="displayName"
            className={styles.input}
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
            required
          />
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
            autoComplete="new-password"
            minLength={8}
            required
          />
          {register.isError && <p className={styles.error}>{register.error.message}</p>}
          <button className={styles.submit} type="submit" disabled={register.isPending}>
            {register.isPending ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p className={styles.switch}>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
