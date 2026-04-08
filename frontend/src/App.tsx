import { useState } from 'react';
import TopBar from './components/TopBar';
import BottomNav, { type Screen } from './components/BottomNav';
import Orchestrate from './screens/Orchestrate';
import Schedule from './screens/Schedule';
import Logs from './screens/Logs';
import Knowledge from './screens/Knowledge';

function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('orchestrate');

  const renderScreen = () => {
    switch (currentScreen) {
      case 'orchestrate': return <Orchestrate />;
      case 'schedule': return <Schedule />;
      case 'logs': return <Logs />;
      case 'knowledge': return <Knowledge />;
      default: return <Orchestrate />;
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface pb-24">
      <TopBar />
      <main key={currentScreen} className="animate-fade-in">
        {renderScreen()}
      </main>
      <BottomNav current={currentScreen} onChange={setCurrentScreen} />
    </div>
  );
}

export default App;