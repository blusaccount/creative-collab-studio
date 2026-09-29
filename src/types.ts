import { useEffect, useRef, useState } from 'react';
import { mockTickets } from './data/mockTickets';
import type { Ticket } from './types';

const palette = ['#111827', '#f8fafc', '#fbbf24', '#f97316', '#a78bfa', '#34d399', '#ef4444'];

function App() {
  const [tickets, setTickets] = useState<Ticket[]>(mockTickets);
  const [selectedId, setSelectedId] = useState<string>(mockTickets[0].id);
  const [brushColor, setBrushColor] = useState<string>('#111827');
  const [brushSize, setBrushSize] = useState<number>(6);
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedId) ?? tickets[0];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    context.fillStyle = '#f8fafc';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.lineCap = 'round';
    context.lineJoin = 'round';
  }, []);

  const getCanvasCoords = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const { x, y } = getCanvasCoords(event);
    context.beginPath();
    context.moveTo(x, y);
    context.lineWidth = brushSize;
    context.strokeStyle = brushColor;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    setIsDrawing(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const { x, y } = getCanvasCoords(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const finishDrawing = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.beginPath();
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#f8fafc';
    context.fillRect(0, 0, canvas.width, canvas.height);
  };

  const completeTicket = () => {
    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === selectedId ? { ...ticket, status: 'ready' } : ticket,
      ),
    );
  };

  const exportAsset = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `${selectedTicket.title.toLowerCase().replace(/\s+/g, '-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="workspace-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Creative Workspace</p>
          <h1>Creative Collab Studio</h1>
        </div>
        <button className="primary-button" onClick={completeTicket}>
          ✓ Complete ticket
        </button>
      </header>

      <main className="workspace-grid">
        <aside className="queue-panel">
          <div className="panel-header">
            <h2>Inbound</h2>
            <span className="count">{tickets.length}</span>
          </div>

          {tickets.map((ticket) => (
            <button
              key={ticket.id}
              className={`ticket-card ${selectedId === ticket.id ? 'selected' : ''}`}
              onClick={() => setSelectedId(ticket.id)}
            >
              <div className="ticket-row">
                <span className="ticket-name">{ticket.title}</span>
                <span className={`status ${ticket.status}`}>{ticket.status}</span>
              </div>
              <p>{ticket.type}</p>
              <small>{ticket.console}</small>
            </button>
          ))}
        </aside>

        <section className="editor-panel">
          <div className="editor-toolbar">
            <div className="tool-group">
              {palette.map((color) => (
                <button
                  key={color}
                  className={`swatch ${brushColor === color ? 'active' : ''}`}
                  style={{ background: color }}
                  onClick={() => setBrushColor(color)}
                  aria-label={`Set color ${color}`}
                />
              ))}
            </div>

            <div className="tool-group range-group">
              <label htmlFor="brush-size">Brush</label>
              <input
                id="brush-size"
                type="range"
                min="2"
                max="24"
                value={brushSize}
                onChange={(event) => setBrushSize(Number(event.target.value))}
              />
              <span>{brushSize}px</span>
            </div>

            <div className="tool-actions">
              <button className="ghost-button" onClick={clearCanvas}>Clear</button>
              <button className="ghost-button" onClick={exportAsset}>Export</button>
            </div>
          </div>

          <div className="editor-body">
            <div className="ticket-metadata">
              <div>
                <p className="label">Asset</p>
                <h3>{selectedTicket.title}</h3>
              </div>
              <div>
                <p className="label">Dimensions</p>
                <strong>{selectedTicket.dimensions.width} × {selectedTicket.dimensions.height}</strong>
              </div>
            </div>

            <p className="ticket-description">{selectedTicket.description}</p>

            <div className="canvas-shell">
              <canvas
                ref={canvasRef}
                width={900}
                height={620}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishDrawing}
                onPointerLeave={finishDrawing}
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
