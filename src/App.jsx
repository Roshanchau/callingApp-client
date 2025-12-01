import { useState } from 'react'
import './App.css'
import CallPage from './components/callPage'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
    {/* current user Id and target user Id */}
      <CallPage currentUserId={"8b49e8e4-8639-4cc2-8ebe-21f6c8319fef"} targetUserId={"c418b1ee-33f7-4043-ba18-a7ad368c53cf"}/>
    </>
  )
}

export default App
