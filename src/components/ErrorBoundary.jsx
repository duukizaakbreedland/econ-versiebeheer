import { Component } from 'react'

// Vangt een fout in een deel van de pagina op, zodat niet de hele app wegvalt.
// Zonder dit laat één kapot paneel alleen de achtergrond over.
// fallback krijgt de fout mee; geef een key mee om na een wissel opnieuw te proberen.
export default class ErrorBoundary extends Component {
  state = { fout: null }

  static getDerivedStateFromError(fout) {
    return { fout }
  }

  componentDidCatch(fout, info) {
    console.error(fout, info.componentStack)
  }

  render() {
    if (this.state.fout) return this.props.fallback(this.state.fout)
    return this.props.children
  }
}
