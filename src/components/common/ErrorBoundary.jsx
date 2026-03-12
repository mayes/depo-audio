import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary__inner">
            <h2 className="error-boundary__title">Something went wrong</h2>
            <p className="error-boundary__msg">{this.state.error?.message || 'An unexpected error occurred.'}</p>
            <button className="error-boundary__btn" onClick={this.handleReset}>Try Again</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
