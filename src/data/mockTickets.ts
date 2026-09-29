export type TicketStatus = 'pending' | 'in-review' | 'ready';

export type TicketType = 'texture' | 'concept' | 'ui' | 'prop' | 'effect';

export type Ticket = {
  id: string;
  title: string;
  type: TicketType;
  console: string;
  status: TicketStatus;
  dimensions: {
    width: number;
    height: number;
  };
  description: string;
};
