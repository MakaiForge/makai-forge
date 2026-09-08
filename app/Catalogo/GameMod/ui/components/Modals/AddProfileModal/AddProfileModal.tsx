import "./AddProfileModal.scss";

interface AddProfileModalProps {
  open: boolean;
  onConfirm: (name: string) => void;
  onClose: () => void;
}

export function AddProfileModal({ open, onConfirm, onClose }: AddProfileModalProps) {
  if (!open) return null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = data.get("profile-name") as string;
    if (name.trim()) {
      onConfirm(name.trim());
      onClose();
    }
  };

  return (
    <div className="add-profile-modal__overlay" onClick={onClose}>
      <div className="add-profile-modal" onClick={e => e.stopPropagation()}>
        <div className="add-profile-modal__header">
          <h3>New Profile</h3>
          <button className="add-profile-modal__close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="add-profile-modal__body">
            <label>Profile Name</label>
            <input name="profile-name" autoFocus placeholder="e.g. Playthrough 1" />
          </div>
          <div className="add-profile-modal__footer">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit">Create</button>
          </div>
        </form>
      </div>
    </div>
  );
}
