import { useParams } from 'react-router-dom';
import MessageThread from '../components/MessageThread.jsx';
import { firstName } from '../lib/checkin.js';

// The coach's thread with one client (/coach/clients/:clientId/messages).
// The id in the address is only passed along: the server checks the
// coaching link on every request and answers 404 when there isn't one.
export default function ClientMessages() {
  const { clientId } = useParams();
  return (
    <MessageThread
      key={clientId}
      clientId={clientId}
      backTo="/clients"
      backLabel="← Clients"
      endedLabel="Back to Clients"
      renderEmpty={(clientName) => ({
        body: `No messages with ${firstName(clientName, 'this client')} yet. Send a quick hello, or check on how their week is going.`,
      })}
    />
  );
}
