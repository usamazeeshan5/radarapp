import RadarMap from './components/RadarMap'
import ErrorBoundary from './components/ErrorBoundary'
import './App.css'

function App() {
  return (
    <ErrorBoundary>
      <RadarMap />
    </ErrorBoundary>
  )
}

export default App
