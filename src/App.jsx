import { useState } from 'react'
import './App.css'
import CallPage from './components/callPage'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
    {/* current user Id and target user Id */}
      <CallPage currentUserId={""} targetUserId={""}/>
    </>
  )
}

export default App
