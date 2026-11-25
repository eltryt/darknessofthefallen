// Wishlist marks: the same request types the loot council uses. Rows saved before keep
// their old marks: «Me interesa» reads as «Mejora menor» and «Pasar» is hidden.
export const wishMarks = [
	['BiS', 'BiS', '★'],
	['Mejora mayor', 'Mejora mayor', '▲'],
	['Mejora menor', 'Mejora menor', '△'],
];
export const wishLabel = (status) =>
	!status || status === 'Me interesa' ? 'Mejora menor' : status;
export const isWanted = (status) => status !== 'Pasar';
export const wishClass = (status) =>
	'is-' +
	wishLabel(status)
		.toLowerCase()
		.replace(/[^a-z]+/g, '-');
