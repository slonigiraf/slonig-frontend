import { AlgorithmStage } from './AlgorithmStage.js';

abstract class Algorithm {
    protected begin: AlgorithmStage | undefined;
    constructor() {}
    public getBegin(): AlgorithmStage {
        if (!this.begin) {
            throw new Error("Begin stage is not initialized");
        }
        return this.begin;
    }
}

export { Algorithm };