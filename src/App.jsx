import { useState } from 'react'
import './App.css'
import CallPage from './components/callPage'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
    {/* current user Id and target user Id */}
      <CallPage currentUserId={"42a1415b-1ab0-4ff8-826f-d5d6c163dc34"} targetUserId={"4a666546-0c40-4e68-bab1-9eda07b5b81a"}/>
    </>
  )
}

export default App
