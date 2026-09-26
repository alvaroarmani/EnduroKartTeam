import { Component } from 'react';

/*
 * Rede de segurança do dia da prova: um erro em qualquer tela NÃO pode apagar o
 * sistema inteiro (anti-DQ). Isola a falha, mostra um aviso e deixa recarregar só
 * aquela tela — a navegação e o resto continuam de pé.
 */
export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('[EnduroKart] erro na tela:', err, info); }
  reset = () => this.setState({ err: null });

  render() {
    if (this.state.err) {
      return (
        <div className="state" style={{ padding: '32px 0' }}>
          <div style={{ fontSize: 15, color: 'var(--live)', fontWeight: 700, marginBottom: 6 }}>⚠ Esta tela falhou</div>
          <p style={{ color: 'var(--ink-2)', margin: '0 0 14px' }}>
            O resto do sistema continua funcionando. Detalhe: <code style={{ color: 'var(--muted)' }}>{String(this.state.err.message || this.state.err)}</code>
          </p>
          <button className="icon-btn" style={{ width: 'auto', padding: '8px 16px' }} onClick={this.reset}>Tentar de novo</button>
        </div>
      );
    }
    return this.props.children;
  }
}
