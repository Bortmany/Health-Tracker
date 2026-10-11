import MessageThread from '../components/MessageThread.jsx';
import { firstName } from '../lib/checkin.js';

// The student's thread with their coach (/messages).
export default function Messages() {
  return (
    <MessageThread
      backTo="/more"
      backLabel="← More"
      endedLabel="Back to More"
      renderEmpty={(coachName) => ({
        title: 'No messages yet',
        body: `Say hello to ${firstName(coachName)}. A quick question is a great way to start.`,
      })}
    />
  );
}
